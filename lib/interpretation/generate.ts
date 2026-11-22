import type { Manifold, ManifoldToplevel } from "manifold-3d/manifold";
import { bakePositions, boundsOf, isIdentityEdit } from "./edits";
import { encodeMesh } from "./mesh-codec";
import type { FinalCluster } from "./source";
import {
  proposalOf,
  type ElementEdit,
  type ElementKind,
  type InterpretationElement,
  type InterpretationModel,
  type ProposalId,
} from "./types";

type MeshData = { positions: Float32Array; indices: Uint32Array };
type Vec3 = [number, number, number];

let kernelPromise: Promise<ManifoldToplevel> | null = null;

function kernel() {
  kernelPromise ??= (async () => {
    const wasm = await (await import("manifold-3d/manifold")).default();
    wasm.setup();
    return wasm;
  })();
  return kernelPromise;
}

function meshData(solid: Manifold): MeshData | null {
  if (solid.status() !== "NoError" || !Number.isFinite(solid.volume()) || Math.abs(solid.volume()) < 0.05) return null;
  const raw = solid.getMesh();
  const stride = raw.numProp || 3;
  const count = raw.vertProperties.length / stride;
  const positions = new Float32Array(count * 3);
  for (let vertex = 0; vertex < count; vertex += 1) {
    positions[vertex * 3] = raw.vertProperties[vertex * stride];
    positions[vertex * 3 + 1] = raw.vertProperties[vertex * stride + 1];
    positions[vertex * 3 + 2] = raw.vertProperties[vertex * stride + 2];
  }
  return { positions, indices: new Uint32Array(raw.triVerts) };
}

function placed(solid: Manifold, origin: Vec3, edit: ElementEdit): Manifold {
  if (isIdentityEdit(edit)) return solid;
  return solid
    .translate(-origin[0], -origin[1], -origin[2])
    .scale(edit.scale)
    .rotate(edit.rotation)
    .translate(origin[0] + edit.translation[0], origin[1] + edit.translation[1], origin[2] + edit.translation[2]);
}

function boxAt(wasm: ManifoldToplevel, min: Vec3, size: Vec3, edit: ElementEdit) {
  const origin: Vec3 = [min[0] + size[0] / 2, min[1] + size[1] / 2, min[2] + size[2] / 2];
  const cube = wasm.Manifold.cube(size, false).translate(min[0], min[1], min[2]);
  return { solid: placed(cube, origin, edit), origin };
}

function editFor(edits: Record<string, ElementEdit>, id: string): ElementEdit {
  return edits[id] ?? { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
}

function finish(mesh: MeshData, edit: ElementEdit): MeshData {
  const { origin } = boundsOf(mesh.positions);
  const positions = bakePositions(mesh.positions, origin, edit);
  return positions === mesh.positions ? mesh : { positions, indices: mesh.indices };
}

function element(
  id: string,
  kind: ElementKind,
  label: string,
  mesh: MeshData,
  cutsMass: boolean,
  elevation: number | null,
): InterpretationElement {
  const fitted = boundsOf(mesh.positions);
  return {
    id,
    kind,
    label,
    editable: true,
    cutsMass,
    mesh: encodeMesh(mesh.positions, mesh.indices),
    origin: fitted.origin,
    elevation: kind === "floor" ? Number(fitted.max[2].toFixed(3)) : elevation,
    size: [Number(fitted.size[0].toFixed(3)), Number(fitted.size[1].toFixed(3)), Number(fitted.size[2].toFixed(3))],
  };
}

const RHYTHM: Record<ProposalId, { story: number; first: number; thickness: number; inset: number }> = {
  preserve: { story: 12, first: 12, thickness: 0.45, inset: 0 },
  balanced: { story: 6, first: 6.5, thickness: 0.55, inset: 0.4 },
  definition: { story: 4.5, first: 5.2, thickness: 0.6, inset: 0.8 },
};

/** Derived building. The cluster stays the exterior wall. Floor plates are inserted slabs in its bounding box. The source file is not written. */
export async function buildInterpretation(cluster: FinalCluster, proposalId: ProposalId, edits: Record<string, ElementEdit>): Promise<InterpretationModel> {
  const wasm = await kernel();
  const proposal = proposalOf(proposalId);
  const rhythm = RHYTHM[proposalId];
  const limitations: string[] = [];
  const trash: { delete(): void }[] = [];
  const own = <T extends { delete(): void }>(value: T) => {
    trash.push(value);
    return value;
  };

  try {
    const source = own(new wasm.Manifold(new wasm.Mesh({
      numProp: 3,
      vertProperties: new Float32Array(cluster.positions),
      triVerts: new Uint32Array(cluster.indices),
    })));
    if (source.status() !== "NoError") throw new Error(`The refined cluster is not a valid solid (${source.status()}).`);

    const fitted = source.boundingBox();
    const box = {
      min: [fitted.min[0], fitted.min[1], fitted.min[2]] as Vec3,
      max: [fitted.max[0], fitted.max[1], fitted.max[2]] as Vec3,
    };
    const span: Vec3 = [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]];
    const levels: number[] = [];
    for (let z = box.min[2] + rhythm.first; z <= box.max[2] - 1.4; z += rhythm.story) {
      levels.push(Number(z.toFixed(3)));
    }
    if (levels.length === 0) limitations.push("The bounding box is shorter than one floor interval, so no floor plate was inserted.");

    const floors: { id: string; elevation: number; mesh: MeshData }[] = [];
    for (let index = 0; index < levels.length; index += 1) {
      const elevation = levels[index];
      const id = `floor-${index}`;
      const min: Vec3 = [box.min[0] + rhythm.inset, box.min[1] + rhythm.inset, elevation - rhythm.thickness];
      const size: Vec3 = [Math.max(0.2, span[0] - rhythm.inset * 2), Math.max(0.2, span[1] - rhythm.inset * 2), rhythm.thickness];
      const slab = boxAt(wasm, min, size, editFor(edits, id));
      own(slab.solid);
      const carved = own(slab.solid.subtract(source));
      const plate = carved.status() === "NoError" ? meshData(carved) : null;
      if (plate) {
        floors.push({ id, elevation, mesh: plate });
        continue;
      }
      const full = meshData(slab.solid);
      if (!full) continue;
      limitations.push(`Floor ${index + 1} could not be carved against the exterior wall, so the inserted slab keeps its bounding-box footprint.`);
      floors.push({ id, elevation, mesh: full });
    }

    let mass = source;

    const cutters: InterpretationElement[] = [];
    const cut = (id: string, kind: ElementKind, label: string, min: Vec3, size: Vec3) => {
      const edit = editFor(edits, id);
      const cutter = boxAt(wasm, min, size, edit);
      own(cutter.solid);
      const data = meshData(cutter.solid);
      if (!data) return;
      const before = Math.abs(mass.volume());
      const next = mass.subtract(cutter.solid);
      if (next.status() !== "NoError" || before - Math.abs(next.volume()) < 0.4) {
        limitations.push(`${label} does not cut the exterior wall at its current position.`);
      } else {
        mass = own(next);
      }
      cutters.push(element(id, kind, label, data, true, null));
    };

    if (proposalId !== "preserve") {
      const center: [number, number] = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2];
      const reach = Math.min(span[0], span[1]);
      const probes: [number, number][] = [
        center,
        [center[0] - reach * 0.18, center[1]],
        [center[0] + reach * 0.18, center[1]],
        [center[0], center[1] - reach * 0.18],
        [center[0], center[1] + reach * 0.18],
      ];
      let coreAt: [number, number] = center;
      let coreVolume = 0;
      const coreSize = proposalId === "definition" ? 4.2 : 3.4;
      for (const probe of probes) {
        const probeBox = own(wasm.Manifold.cube([coreSize, coreSize, 8], false).translate(probe[0] - coreSize / 2, probe[1] - coreSize / 2, box.min[2] + span[2] * 0.35));
        const hit = own(source.intersect(probeBox));
        const volume = Math.abs(hit.volume());
        if (volume > coreVolume) {
          coreVolume = volume;
          coreAt = probe;
        }
      }
      const wall = 0.45;
      const outerMin: Vec3 = [coreAt[0] - coreSize / 2, coreAt[1] - coreSize / 2, box.min[2]];
      const outerSize: Vec3 = [coreSize, coreSize, span[2]];
      const innerMin: Vec3 = [outerMin[0] + wall, outerMin[1] + wall, box.min[2]];
      const innerSize: Vec3 = [coreSize - wall * 2, coreSize - wall * 2, span[2]];
      const coreEdit = editFor(edits, "core");
      const outer = boxAt(wasm, outerMin, outerSize, coreEdit);
      const inner = boxAt(wasm, innerMin, innerSize, coreEdit);
      own(outer.solid);
      own(inner.solid);
      const tube = own(outer.solid.subtract(inner.solid));
      const insertedCore = own(tube.subtract(source));
      const coreMesh = (insertedCore.status() === "NoError" ? meshData(insertedCore) : null) ?? meshData(tube);
      if (coreMesh) cutters.push(element("core", "core", "Circulation core", coreMesh, true, null));
      else limitations.push("The circulation core could not be inserted in the bounding box.");
      if (coreVolume <= 4) limitations.push("The circulation core meets little of the exterior wall, so it stays an inserted shaft in the bounding box.");
      const before = Math.abs(mass.volume());
      const shaft = mass.subtract(inner.solid);
      if (shaft.status() === "NoError" && before - Math.abs(shaft.volume()) >= 0.4) mass = own(shaft);
      else limitations.push("The core shaft did not cut the exterior wall.");

      const ground = own(source.slice(Math.min(box.max[2] - 0.4, box.min[2] + Math.min(2.4, Math.max(1.2, span[2] * 0.12)))));
      const footprint = ground.bounds();
      const midY = (footprint.min[1] + footprint.max[1]) / 2;
      const midX = (footprint.min[0] + footprint.max[0]) / 2;
      const faces: { min: Vec3; size: Vec3 }[] = [
        { min: [footprint.min[0] - 0.6, midY - 1.8, box.min[2]], size: [7.5, 3.6, 4.6] },
        { min: [footprint.max[0] - 6.9, midY - 1.8, box.min[2]], size: [7.5, 3.6, 4.6] },
        { min: [midX - 1.8, footprint.min[1] - 0.6, box.min[2]], size: [3.6, 7.5, 4.6] },
        { min: [midX - 1.8, footprint.max[1] - 6.9, box.min[2]], size: [3.6, 7.5, 4.6] },
      ];
      let entrance: { min: Vec3; size: Vec3 } | null = null;
      let entranceCut = 0;
      for (const face of faces) {
        const cutter = boxAt(wasm, face.min, face.size, editFor(edits, "entrance"));
        own(cutter.solid);
        const hit = own(source.intersect(cutter.solid));
        const volume = Math.abs(hit.volume());
        if (volume > entranceCut) {
          entranceCut = volume;
          entrance = face;
        }
      }
      if (entrance && entranceCut > 1) cut("entrance", "entrance", "Entrance", entrance.min, entrance.size);
      else limitations.push("No entrance cut met the exterior wall.");

      if (proposalId === "definition") {
        [box.min[2] + span[2] * 0.42, box.min[2] + span[2] * 0.68].forEach((z, index) => {
          const section = own(source.slice(z));
          if (section.area() < 12) {
            limitations.push(`Opening ${index + 1} has no exterior wall at Z ${z.toFixed(1)}.`);
            return;
          }
          const edge = section.bounds();
          const center = (edge.min[0] + edge.max[0]) / 2;
          const width = Math.min(6.5, (edge.max[0] - edge.min[0]) * 0.42);
          const min: Vec3 = index === 0
            ? [center - width / 2, edge.min[1] - 0.5, z]
            : [center - width / 2, edge.max[1] - 3.2, z];
          cut(`opening-${index}`, "opening", `Opening ${index + 1}`, min, [width, 3.8, 1.8]);
        });
      }
    }

    const extras: InterpretationElement[] = [];
    if (proposalId !== "preserve" && levels.length > 0) {
      const level = levels[Math.floor((levels.length - 1) / 2)];
      const alongX = span[0] >= span[1];
      const length = (alongX ? span[0] : span[1]) * 0.62;
      const min: Vec3 = alongX
        ? [(box.min[0] + box.max[0]) / 2 - length / 2, (box.min[1] + box.max[1]) / 2 - 1.15, level - 2]
        : [(box.min[0] + box.max[0]) / 2 - 1.15, (box.min[1] + box.max[1]) / 2 - length / 2, level - 2];
      const size: Vec3 = alongX ? [length, 2.3, 1.9] : [2.3, length, 1.9];
      const spine = boxAt(wasm, min, size, editFor(edits, "connector"));
      own(spine.solid);
      const carved = own(spine.solid.subtract(source));
      const fittedSpine = (carved.status() === "NoError" ? meshData(carved) : null) ?? meshData(spine.solid);
      if (fittedSpine) extras.push(element("connector", "connector", "Horizontal connection", fittedSpine, false, level));
      else limitations.push("The horizontal connection could not be inserted in the bounding box.");
    }

    if (proposalId !== "preserve") {
      cluster.seats.forEach((seat, index) => {
        const column = own(wasm.Manifold.cylinder(span[2], 0.48, 0.48, 12).translate(seat.x, seat.y, box.min[2]));
        const fittedColumn = meshData(column);
        if (!fittedColumn) return;
        const id = `column-${index}`;
        extras.push(element(id, "column", `Column ${seat.instanceId}`, finish(fittedColumn, editFor(edits, id)), false, null));
      });
      if (!extras.some((item) => item.kind === "column")) {
        limitations.push("No preliminary column was inserted in the bounding box.");
      } else {
        limitations.push("Columns are preliminary solids inside the bounding box, at the seated tiles. They are not a structural analysis. Moving one does not refit it to the wall.");
      }
    }

    const massEdit = editFor(edits, "mass");
    const untouched = mass === source && isIdentityEdit(massEdit);
    const massMesh = untouched
      ? { positions: new Float32Array(cluster.positions), indices: new Uint32Array(cluster.indices) }
      : meshData(mass);
    if (!massMesh) throw new Error("The interpreted solid is empty.");
    const massDone = untouched ? massMesh : finish(massMesh, massEdit);
    const elements = [
      element("mass", "mass", "Exterior wall", massDone, false, null),
      ...floors.map((floor, index) => element(floor.id, "floor", `Floor ${index + 1}`, floor.mesh, false, floor.elevation)),
      ...cutters,
      ...extras,
    ];

    return {
      contract: "architectural-interpretation-v1",
      units: "skill6",
      axes: "X and Y horizontal, Z up",
      source: {
        id: cluster.id,
        meshFile: cluster.meshFile,
        tiles: cluster.tiles,
        volume: cluster.volume,
        triangles: cluster.triangles,
        bounds: cluster.bounds,
        validation: cluster.validation,
      },
      proposal: { id: proposal.id, label: proposal.label, summary: proposal.summary },
      limitations,
      original: encodeMesh(new Float32Array(cluster.positions), new Uint32Array(cluster.indices)),
      elements,
    };
  } finally {
    const seen = new Set<{ delete(): void }>();
    for (const item of trash) {
      if (seen.has(item)) continue;
      seen.add(item);
      item.delete();
    }
  }
}
