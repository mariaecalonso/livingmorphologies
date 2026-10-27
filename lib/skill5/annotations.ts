import { composeAssemblyPose, type SiteAssembly } from "./assembly";
import { planLocal } from "./metrics";

export type AnnotationKind = "entrance" | "circulation";
export type AnnotationAttachment = "site" | "assembly";

export type SiteAnnotation = {
  id: string;
  kind: AnnotationKind;
  attachment: AnnotationAttachment;
  assemblyPlacementId: string | null;
  label: string;
  position: { x: number; z: number };
  end: { x: number; z: number } | null;
};

export type WorldAnnotation = SiteAnnotation & {
  world: { x: number; z: number };
  worldEnd: { x: number; z: number } | null;
};

export function worldAnnotations(notes: readonly SiteAnnotation[], assemblies: readonly SiteAssembly[]): WorldAnnotation[] {
  return notes.flatMap((note) => {
    if (note.attachment === "site") {
      return [{ ...note, world: note.position, worldEnd: note.end }];
    }
    const host = assemblies.find((assembly) => assembly.placementId === note.assemblyPlacementId);
    if (!host) return [];
    const origin = host.transform;
    const world = composeAssemblyPose(
      { x: origin.position.x, z: origin.position.z, rotationY: origin.rotationY },
      { x: note.position.x, z: note.position.z, rotationY: 0 },
    );
    const worldEnd = note.end ? composeAssemblyPose(
      { x: origin.position.x, z: origin.position.z, rotationY: origin.rotationY },
      { x: note.end.x, z: note.end.z, rotationY: 0 },
    ) : null;
    return [{ ...note, world, worldEnd }];
  });
}

export function localOnAssembly(world: { x: number; z: number }, assembly: SiteAssembly) {
  return planLocal(world, assembly.transform.position, assembly.transform.rotationY);
}
