"use client";

import { useSyncExternalStore } from "react";

export type VerticalView = "stack" | "mesh" | "voxel";

export const VERTICAL_VIEWS: { hash: string; label: string; view: VerticalView }[] = [
  { hash: "#stack", label: "Stack", view: "stack" },
  { hash: "#isomesh", label: "Isomesh", view: "mesh" },
  { hash: "#voxels", label: "Voxels", view: "voxel" },
];

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function readView(): VerticalView {
  return VERTICAL_VIEWS.find((item) => item.hash === window.location.hash)?.view ?? "stack";
}

export function useVerticalView(): VerticalView {
  return useSyncExternalStore(subscribeHash, readView, () => "stack");
}
