import type { SiteAnnotation } from "./annotations";
import type { SiteAssembly } from "./assembly";
import type { PlacedModule } from "./placement";

export type CompositionSnapshot = {
  instances: PlacedModule[];
  assemblies: SiteAssembly[];
  annotations: SiteAnnotation[];
};

export type EditHistory = {
  present: CompositionSnapshot;
  undo: CompositionSnapshot[];
  redo: CompositionSnapshot[];
  gesture: CompositionSnapshot | null;
};

function copy<T>(value: T): T {
  return structuredClone(value);
}

export function emptyComposition(): CompositionSnapshot {
  return { instances: [], assemblies: [], annotations: [] };
}

export function emptyEditHistory(present: CompositionSnapshot = emptyComposition()): EditHistory {
  return { present: copy(present), undo: [], redo: [], gesture: null };
}

export function sameComposition(a: CompositionSnapshot, b: CompositionSnapshot) {
  return JSON.stringify(a.instances) === JSON.stringify(b.instances)
    && JSON.stringify(a.assemblies) === JSON.stringify(b.assemblies)
    && JSON.stringify(a.annotations) === JSON.stringify(b.annotations);
}

/** Record `next` as the composition after one completed edit. A gesture only updates the live present. */
export function rememberEdit(history: EditHistory, next: CompositionSnapshot): EditHistory {
  if (history.gesture) {
    if (sameComposition(history.present, next)) return history;
    return { ...history, present: copy(next) };
  }
  if (sameComposition(history.present, next)) return history;
  return { present: copy(next), undo: [...history.undo, copy(history.present)], redo: [], gesture: null };
}

/** Keep the live composition aligned when a change is not a user edit, such as a mesh load. */
export function adoptPresent(history: EditHistory, next: CompositionSnapshot): EditHistory {
  if (history.gesture || sameComposition(history.present, next)) return history;
  return { ...history, present: copy(next) };
}

export function beginGesture(history: EditHistory): EditHistory {
  if (history.gesture) return history;
  return { ...history, gesture: copy(history.present) };
}

export function endGesture(history: EditHistory): EditHistory {
  if (!history.gesture) return history;
  if (sameComposition(history.gesture, history.present)) return { ...history, gesture: null };
  return { present: history.present, undo: [...history.undo, history.gesture], redo: [], gesture: null };
}

export function undoEdit(history: EditHistory): EditHistory | null {
  if (history.gesture || history.undo.length === 0) return null;
  const previous = history.undo[history.undo.length - 1];
  return {
    present: copy(previous),
    undo: history.undo.slice(0, -1),
    redo: [...history.redo, copy(history.present)],
    gesture: null,
  };
}

export function redoEdit(history: EditHistory): EditHistory | null {
  if (history.gesture || history.redo.length === 0) return null;
  const next = history.redo[history.redo.length - 1];
  return {
    present: copy(next),
    undo: [...history.undo, copy(history.present)],
    redo: history.redo.slice(0, -1),
    gesture: null,
  };
}
