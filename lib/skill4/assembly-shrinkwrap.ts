import { filmWrapAssembly, type FilmWrap } from "./film-wrap";

type WorldMesh = { positions: Float32Array; indices: Uint32Array };

/**
 * The geometry step behind Run validation.
 * The sweep animation stays in the panel. This is the shrink-wrap it adopts.
 */
export function runAssemblyShrinkwrap(meshes: readonly WorldMesh[]): FilmWrap | null {
  try {
    const film = filmWrapAssembly(meshes);
    if (!film?.check.adopted || film.mesh.triangles <= 4) return null;
    return film;
  } catch {
    return null;
  }
}
